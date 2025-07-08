import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role_definition } from './role_definition.entity';
import { Route_definition } from './route_definition.entity';
import { Route_permission_map } from './route_permission_map.entity';

@Entity('route_permission_definition')
export class Route_permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Index()
    @ManyToOne('Role_definition', (rel: any) => rel.routePermissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: any;
    @Index()
    @ManyToOne('Route_definition', (rel: any) => rel.routePermissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @ManyToMany('Route_permission_map', (rel: any) => rel.route_permissions, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    actions: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
