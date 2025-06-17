import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role_definition } from './role_definition.entity';
import { Route_definition } from './route_definition.entity';

@Entity('route_permission_definition')
export class Route_permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true })
    actions: any;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Index()
    @ManyToOne('Role_definition', (rel:any) => rel.routePermissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: Role_definition;
    @Index()
    @ManyToOne('Route_definition', (rel:any) => rel.routePermissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
