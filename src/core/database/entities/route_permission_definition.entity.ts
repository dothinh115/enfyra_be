import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';
import { Role_definition } from './role_definition.entity';
import { Route_definition } from './route_definition.entity';
import { Method_definition } from './method_definition.entity';

@Entity('route_permission_definition')
export class Route_permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @ManyToMany('User_definition', (rel: any) => rel.allowedRoutePermissions, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    allowedUsers: any;
    @Index()
    @ManyToOne('Role_definition', (rel: any) => rel.routePermissions, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: any;
    @Index()
    @ManyToOne('Route_definition', (rel: any) => rel.routePermissions, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @ManyToMany('Method_definition', (rel: any) => rel.route_permissions, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    methods: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
